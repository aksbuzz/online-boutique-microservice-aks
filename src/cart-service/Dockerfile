FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app

COPY src/cart-service/src/cart-service.csproj ./
RUN dotnet restore cart-service.csproj

COPY src/cart-service/src/ .
RUN dotnet publish -c Release -o /out cart-service.csproj

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_HTTP_PORTS=5001
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true
EXPOSE 5001
ENTRYPOINT ["dotnet", "cart-service.dll"]