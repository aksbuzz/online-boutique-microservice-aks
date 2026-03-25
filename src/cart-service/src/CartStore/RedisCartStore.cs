using Google.Protobuf;
using Grpc.Core;
using Microsoft.Extensions.Caching.Distributed;

namespace cart_service.CartStore;

public class RedisCartStore(IDistributedCache _cache) : ICartStore
{
    public async Task AddItemAsync(string userId, string productId, int quantity)
    {
        Console.WriteLine($"AddItemAsync called with userId={userId}, productId={productId}, quantity={quantity}");

        try
        {
            Cart cart;
            var value = await _cache.GetAsync(userId);
            if (value == null)
            {
                cart = new Cart { UserId = userId };
                cart.Items.Add(new CartItem { ProductId = productId, Quantity = quantity });
            }
            else
            {
                cart = Cart.Parser.ParseFrom(value);
                var existingItem = cart.Items.SingleOrDefault(i => i.ProductId == productId);
                if (existingItem == null)
                {
                    cart.Items.Add(new CartItem { ProductId = productId, Quantity = quantity });
                }
                else
                {
                    existingItem.Quantity += quantity;
                }
            }

            await _cache.SetAsync(userId, cart.ToByteArray());
        }
        catch (Exception ex)
        {
            throw new RpcException(new Status(StatusCode.FailedPrecondition, $"Can't access cart storage. {ex}"));
        }
    }


    public async Task EmptyCartAsync(string userId)
    {
        Console.WriteLine($"EmptyCartAsync called with userId={userId}");

        try
        {
            var cart = new Cart();
            await _cache.SetAsync(userId, cart.ToByteArray());
        }
        catch (Exception ex)
        {
            throw new RpcException(new Status(StatusCode.FailedPrecondition, $"Can't access cart storage. {ex}"));
        }
    }

    public async Task<Cart> GetCartAsync(string userId)
    {
        Console.WriteLine($"GetCartAsync called with userId={userId}");

        try
        {
            var value = await _cache.GetAsync(userId);
            if (value != null)
            {
                return Cart.Parser.ParseFrom(value);
            }
            
            return new Cart();
        }
        catch (Exception ex)
        {
            throw new RpcException(new Status(StatusCode.FailedPrecondition, $"Can't access cart storage. {ex}"));
        }
    }

    public bool Ping()
    {
        try
        {
            _cache.GetAsync("_ping_probe_").GetAwaiter().GetResult();
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }
}