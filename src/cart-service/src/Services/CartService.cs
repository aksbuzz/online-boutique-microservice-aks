using cart_service.CartStore;
using Grpc.Core;

namespace cart_service.Services;

public class CartService(ICartStore _cartStore) : cart_service.CartService.CartServiceBase
{
    private readonly static Empty Empty = new();

    public override async Task<Empty> AddItem(AddItemRequest request, ServerCallContext context)
    {
        await _cartStore.AddItemAsync(request.UserId, request.Item.ProductId, request.Item.Quantity);
        return Empty;
    }

    public override Task<Cart> GetCart(GetCartRequest request, ServerCallContext context)
    {
        var cart = await _cartStore.GetCartAsync(request.UserId, context.CancellationToken);
        return cart; 
    }

    public override async Task<Empty> EmptyCart(EmptyCartRequest request, ServerCallContext context)
    {
        await _cartStore.EmptyCartAsync(request.UserId);
        return Empty;
    }
}
