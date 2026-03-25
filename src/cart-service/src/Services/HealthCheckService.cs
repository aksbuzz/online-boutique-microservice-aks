using cart_service.CartStore;
using Grpc.Core;
using Grpc.Health.V1;

namespace cart_service.Services;

internal class HealthCheckService(ICartStore _cartStore) : Health.HealthBase
{
    public override Task<HealthCheckResponse> Check(HealthCheckRequest request, ServerCallContext context)
    {
        Console.WriteLine("Checking CartService Health");
        return Task.FromResult(new HealthCheckResponse
        {
            Status = _cartStore.Ping()
                ? HealthCheckResponse.Types.ServingStatus.Serving
                : HealthCheckResponse.Types.ServingStatus.NotServing
        });
    }
}