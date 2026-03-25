namespace payment_service.Payment;

public interface IStripeCharger
{
    Task<string> ChargeAsync(ChargeRequest request, CancellationToken cancellationToken = default);
}