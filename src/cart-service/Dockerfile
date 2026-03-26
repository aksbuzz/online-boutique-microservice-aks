FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app
COPY src/cart-service.csproj ./src/
RUN dotnet restore ./src/cart-service.csproj
COPY src/ ./src/
RUN dotnet publish ./src/cart-service.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_HTTP_PORTS=5001
EXPOSE 5001
ENTRYPOINT ["dotnet", "cart-service.dll"]
