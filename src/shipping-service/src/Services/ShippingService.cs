using Grpc.Core;

namespace shipping_service.Services;

public partial class ShippingService(ILogger<ShippingService> logger) : shipping_service.ShippingService.ShippingServiceBase
{
    private const long BaseUnits = 8;
    private const int PerItemCents = 50;
    private const long OverseasSurchargeUnits = 5;

    public override Task<GetQuoteResponse> GetQuote(GetQuoteRequest request, ServerCallContext context)
    {
        int totalItems = request.Items.Sum(i => i.Quantity);
        long totalCents = BaseUnits * 100 + totalItems * PerItemCents;
        bool isOverseas = !string.Equals(request.Address.Country, "US", StringComparison.OrdinalIgnoreCase);
        if (isOverseas)
            totalCents += OverseasSurchargeUnits * 100;

        long units = totalCents / 100;
        int nanos = (int)(totalCents % 100) * 10_000_000;

        logger.LogInformation("GetQuote: {ItemCount} items to {Country} => {Units}.{Cents} USD",
            totalItems, request.Address.Country, units, (int)(totalCents % 100));

        return Task.FromResult(new GetQuoteResponse
        {
            CostUsd = new Money { CurrencyCode = "USD", Units = units, Nanos = nanos }
        });
    }

    public override Task<ShipOrderResponse> ShipOrder(ShipOrderRequest request, ServerCallContext context)
    {
        string trackingId = $"SHIP-{Guid.NewGuid():N}"[..14].ToUpper();

        logger.LogInformation("ShipOrder: tracking_id={TrackingId} destination={City},{Country}",
            trackingId, request.Address.City, request.Address.Country);

        return Task.FromResult(new ShipOrderResponse { TrackingId = trackingId });
    }
}
