using shipping_service.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddGrpc();

var app = builder.Build();

app.MapGrpcService<ShippingService>();
app.MapGrpcService<HealthCheckService>();

app.Run();
