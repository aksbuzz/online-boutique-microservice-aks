using cart_service.CartStore;
using cart_service.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddStackExchangeRedisCache(o => 
    o.Configuration = builder.Configuration["REDIS_ADDR"]);

builder.Services.AddSingleton<ICartStore, RedisCartStore>();
builder.Services.AddGrpc();

var app = builder.Build();

app.MapGrpcService<CartService>();
app.MapGrpcService<HealthCheckService>();

app.Run();
