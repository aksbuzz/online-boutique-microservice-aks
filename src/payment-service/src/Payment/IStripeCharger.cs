namespace payment_service.Payment;

public interface IStripeCharger
{
    Task<string> ChargeAsync(string paymentMethodId, long amountCents, string currency, string? orderId, CancellationToken cancellationToken = default);
}