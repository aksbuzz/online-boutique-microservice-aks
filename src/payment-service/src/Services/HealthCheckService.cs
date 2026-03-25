using Grpc.Core;
using Grpc.Health.V1;

namespace payment_service.Services;

internal class HealthCheckService : Health.HealthBase
{
    public override Task<HealthCheckResponse> Check(HealthCheckRequest request, ServerCallContext context)
    {
        Console.WriteLine("Checking PaymentService Health");
        return Task.FromResult(new HealthCheckResponse
        {
            Status = HealthCheckResponse.Types.ServingStatus.Serving
        });
    }
}
