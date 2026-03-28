FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app
COPY src/payment-service/src/payment-service.csproj ./
RUN dotnet restore payment-service.csproj
COPY src/payment-service/src/ .
RUN dotnet publish  -c Release -o /out payment-service.csproj

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_HTTP_PORTS=5006
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true
EXPOSE 5006
ENTRYPOINT ["dotnet", "payment-service.dll"]
