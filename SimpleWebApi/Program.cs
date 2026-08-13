var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseHttpsRedirection();

// Root endpoint
app.MapGet("/", () => new
{
    Message = "Welcome to .NET 10 Web API!",
    Framework = ".NET 10.0",
    Status = "Running",
    Timestamp = DateTime.UtcNow,
    Endpoints = new[] { "/", "/api/hello", "/weatherforecast" }
});

// Hello endpoint
app.MapGet("/api/hello", (string? name) => new
{
    Message = $"Hello, {name ?? "World"}!",
    Environment = ".NET 10 (C#)",
    Time = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")
});

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
});

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

