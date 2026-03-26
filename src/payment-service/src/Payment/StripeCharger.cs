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
    private readonly TokenService _tokenService;
    private readonly ChargeService _chargeService;

    // Polly resilience pipeline — wraps calls with retry logic.
    private readonly ResiliencePipeline _pipeline;

    public StripeCharger(string secretKey)
    {
        var client = new StripeClient(secretKey);
        _tokenService = new TokenService(client);
        _chargeService = new ChargeService(client);

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
                        ex.StripeError?.Code == null ||       // unknown Stripe error — assume transient
                        !_permanentCodes.Contains(ex.StripeError.Code) &&
                         (int)ex.HttpStatusCode >= 500 ||     // Stripe server error
                         (int)ex.HttpStatusCode == 429)       // rate limited
            })
            .Build();
    }

    public async Task<string> ChargeAsync(ChargeRequest request, CancellationToken cancellationToken = default)
    {
        // ExecuteAsync runs the lambda inside the retry pipeline.
        return await _pipeline.ExecuteAsync(async ct =>
        {
            // Step 1: tokenise the raw card data. Stripe returns a short-lived token
            // so the actual card number never travels beyond this single call.
            var token = await _tokenService.CreateAsync(new TokenCreateOptions
            {
                Card = new TokenCardOptions
                {
                    Number = request.CreditCard.CreditCardNumber,
                    Cvc = request.CreditCard.CreditCardCvv.ToString(),
                    ExpYear = request.CreditCard.CreditCardExpirationYear.ToString(),
                    ExpMonth = request.CreditCard.CreditCardExpirationMonth.ToString(),
                }
            }, cancellationToken: ct);

            // Stripe requires the amount in the smallest currency unit (cents for USD).
            // Money proto stores dollars as units + nanos (billionths), so convert accordingly.
            long amountCents = request.Amount.Units * 100 + request.Amount.Nanos / 10_000_000;

            // Pass order_id as Stripe's idempotency key — duplicate retries return the
            // original charge result instead of creating a second charge.
            var requestOptions = string.IsNullOrEmpty(request.OrderId)
                ? null
                : new RequestOptions { IdempotencyKey = request.OrderId };

            // Step 2: create the charge using the token from step 1.
            var charge = await _chargeService.CreateAsync(new ChargeCreateOptions
            {
                Amount = amountCents,
                Currency = request.Amount.CurrencyCode.ToLower(), // Stripe expects lowercase, e.g. "usd"
                Source = token.Id,
                Description = "Online Boutique order",
            }, requestOptions, ct);

            // charge.Id is the Stripe transaction ID, e.g. "ch_3abc..."
            return charge.Id;
        }, cancellationToken);
    }
}