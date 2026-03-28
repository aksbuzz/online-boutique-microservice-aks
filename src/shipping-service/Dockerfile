FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app
COPY src/shipping-service/src/shipping-service.csproj ./
RUN dotnet restore shipping-service.csproj
COPY src/shipping-service/src/ .
RUN dotnet publish -c Release -o /out shipping-service.csproj

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_HTTP_PORTS=5004
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true
EXPOSE 5004
ENTRYPOINT ["dotnet", "shipping-service.dll"]
