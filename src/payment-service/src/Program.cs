using payment_service.Payment;
using payment_service.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddGrpc();

var stripeSecretKey = builder.Configuration["STRIPE_SECRET_KEY"] ?? string.Empty;
builder.Services.AddSingleton<IStripeCharger>(new StripeCharger(stripeSecretKey));

var app = builder.Build();

app.MapGrpcService<PaymentService>();
app.MapGrpcService<HealthCheckService>();

app.Run();