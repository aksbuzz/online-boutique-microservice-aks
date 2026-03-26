FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /app
COPY src/payment-service.csproj ./src/
RUN dotnet restore ./src/payment-service.csproj
COPY src/ ./src/
RUN dotnet publish ./src/payment-service.csproj -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ASPNETCORE_HTTP_PORTS=5006
EXPOSE 5006
ENTRYPOINT ["dotnet", "payment-service.dll"]
