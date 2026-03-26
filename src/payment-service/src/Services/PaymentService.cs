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
            long amountCents = request.Amount.Units * 100 + request.Amount.Nanos / 10_000_000;

            var transactionId = await charger.ChargeAsync(
                request.PaymentMethodId,
                amountCents,
                request.Amount.CurrencyCode,
                request.OrderId,
                context.CancellationToken);

            logger.LogInformation("PaymentIntent succeeded: {TransactionId}", transactionId);

            return new ChargeResponse { TransactionId = transactionId };
        }
        catch (StripeException ex) when (ex.StripeError?.Code != null && _cardErrorCodes.Contains(ex.StripeError.Code))
        {
            throw new RpcException(new Status(StatusCode.InvalidArgument, ex.StripeError.Message ?? ex.Message));
        }
        catch (StripeException ex) when ((int?)ex.HttpStatusCode == 429)
        {
            throw new RpcException(new Status(StatusCode.ResourceExhausted, "payment service rate limit exceeded"));
        }
        catch (Exception)
        {
            throw new RpcException(new Status(StatusCode.Unavailable, "payment service unavailable"));
        }
    }
}