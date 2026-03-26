FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /app
COPY src/shipping-service.csproj ./src/
RUN dotnet restore ./src/shipping-service.csproj
COPY src/ ./src/
RUN dotnet publish ./src/shipping-service.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_HTTP_PORTS=5004
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true
EXPOSE 5004
ENTRYPOINT ["dotnet", "shipping-service.dll"]
