using Polly;
using Polly.Retry;
using Stripe;

namespace payment_service.Payment;


public class StripeCharger : IStripeCharger
{
    // Stripe error codes that mean the card itself is the problem — retrying won't help.
    private static readonly HashSet<string> _permanentCodes = new(StringComparer.OrdinalIgnoreCase)
    {
        "card_declined", "incorrect_number", "invalid_expiry_year",
        "invalid_expiry_month", "invalid_cvc", "expired_card", "insufficient_funds"
    };
    private readonly PaymentIntentService _paymentIntentService;
    // Polly resilience pipeline — wraps calls with retry logic.
    private readonly ResiliencePipeline _pipeline;


    public StripeCharger(string secretKey)
    {
        var client = new StripeClient(secretKey);
        _paymentIntentService = new PaymentIntentService(client);

        _pipeline = new ResiliencePipelineBuilder()
            .AddRetry(new RetryStrategyOptions
            {
                MaxRetryAttempts = 3,
                BackoffType = DelayBackoffType.Exponential,
                Delay = TimeSpan.FromMilliseconds(500),
                UseJitter = true, // adds randomness so retries from many instances don't all hit at once
                // Only retry on transient errors — never on permanent card errors.
                ShouldHandle = new PredicateBuilder()
                    .Handle<HttpRequestException>()           // network failures
                    .Handle<StripeException>(ex =>
                        ex.StripeError?.Type != "invalid_request_error" && 
                        (ex.StripeError?.Code == null ||       // unknown Stripe error — assume transient
                            (!_permanentCodes.Contains(ex.StripeError.Code) &&
                            ((int)ex.HttpStatusCode >= 500 ||     // Stripe server error
                            (int)ex.HttpStatusCode == 429))))       // rate limited
            })
            .Build();
    }

    public async Task<string> ChargeAsync(
        string paymentMethodId,
        long amountCents,
        string currency,
        string? orderId,
        CancellationToken cancellationToken = default)
    {
        // ExecuteAsync runs the lambda inside the retry pipeline.
        return await _pipeline.ExecuteAsync(async ct =>
        {
            var options = new PaymentIntentCreateOptions
            {
                Amount = amountCents,
                Currency = currency.ToLower(),
                PaymentMethod = paymentMethodId,
                PaymentMethodTypes = ["card"],
                Confirm = true, // immediately attempt payment
            };

            var requestOptions = string.IsNullOrEmpty(orderId)
                ? null
                : new RequestOptions { IdempotencyKey = orderId };

            var intent = await _paymentIntentService.CreateAsync(options, requestOptions, ct);

            // Handle required actions (3D Secure, etc.)
            if (intent.Status == "requires_action")
            {
                throw new StripeException("Payment requires additional authentication.");
            }

            if (intent.Status != "succeeded")
            {
                throw new StripeException($"Payment failed with status: {intent.Status}");
            }

            return intent.Id;
        }, cancellationToken);
    }
}