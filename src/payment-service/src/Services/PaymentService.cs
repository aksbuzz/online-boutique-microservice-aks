using Grpc.Core;
using payment_service.Payment;
using Stripe;

namespace payment_service.Services;

public partial class PaymentService(IStripeCharger charger, ILogger<PaymentService> logger)
    : payment_service.PaymentService.PaymentServiceBase
{
    private static readonly HashSet<string> _cardErrorCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        "card_declined", "incorrect_number", "invalid_expiry_year",
        "invalid_expiry_month", "invalid_cvc", "expired_card", "insufficient_funds"
    };

    public override async Task<ChargeResponse> Charge(ChargeRequest request, ServerCallContext context)
    {
        try
        {
            var transactionId = await charger.ChargeAsync(request, context.CancellationToken);
            logger.LogInformation("Charge succeeded: transaction_id={TransactionId}", transactionId);
            return new ChargeResponse { TransactionId = transactionId };
        }
        catch (StripeException ex) when (ex.StripeError?.Code != null && _cardErrorCodes.Contains(ex.StripeError.Code))
        {
            logger.LogWarning("Card error: code={Code} message={Message}", ex.StripeError.Code, ex.StripeError.Message);
            throw new RpcException(new Status(StatusCode.InvalidArgument, ex.StripeError.Message ?? ex.Message));
        }
        catch (StripeException ex) when ((int?)ex.HttpStatusCode == 429)
        {
            logger.LogError("Stripe rate limit exceeded");
            throw new RpcException(new Status(StatusCode.ResourceExhausted, "payment service rate limit exceeded"));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Charge failed");
            throw new RpcException(new Status(StatusCode.Unavailable, "payment service unavailable"));
        }
    }
}