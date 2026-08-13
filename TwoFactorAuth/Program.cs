using TwoFactorAuth.Services;

var builder = WebApplication.CreateBuilder(args);

// Add CORS policy for API access
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors();

// Enable serving index.html and static assets from wwwroot
app.UseDefaultFiles();
app.UseStaticFiles();

// --- 2FA API Endpoints ---

// 1. Single TOTP Code Generation
app.MapPost("/api/2fa/generate", (TotpRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.Secret))
    {
        return Results.BadRequest(new { Error = "Secret key cannot be empty." });
    }

    try
    {
        var result = TotpService.GenerateTotp(req.Secret, req.Period ?? 30, req.Digits ?? 6);
        return Results.Ok(result);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { Error = ex.Message });
    }
});

// 2. Batch TOTP Code Generation
app.MapPost("/api/2fa/batch", (BatchTotpRequest req) =>
{
    if (req.Secrets == null || req.Secrets.Length == 0)
    {
        return Results.BadRequest(new { Error = "No secrets provided." });
    }

    var results = req.Secrets
        .Where(s => !string.IsNullOrWhiteSpace(s))
        .Select(s =>
        {
            try
            {
                var r = TotpService.GenerateTotp(s.Trim(), req.Period ?? 30, req.Digits ?? 6);
                return new { Success = true, Input = s, Data = r, Error = (string?)null };
            }
            catch (Exception ex)
            {
                return new { Success = false, Input = s, Data = (TotpResult?)null, Error = ex.Message };
            }
        })
        .ToArray();

    return Results.Ok(results);
});

// 3. Parse otpauth:// URI
app.MapPost("/api/2fa/parse", (ParseRequest req) =>
{
    if (string.IsNullOrWhiteSpace(req.Uri))
    {
        return Results.BadRequest(new { Error = "URI cannot be empty." });
    }

    try
    {
        var parsed = TotpService.ParseOtpAuthUri(req.Uri);
        return Results.Ok(parsed);
    }
    catch (Exception ex)
    {
        return Results.BadRequest(new { Error = ex.Message });
    }
});

// 4. Get Server UTC Time for Clock Sync
app.MapGet("/api/2fa/server-time", () =>
{
    var now = DateTime.UtcNow;
    return Results.Ok(new
    {
        UtcTime = now,
        UnixTimestamp = ((DateTimeOffset)now).ToUnixTimeSeconds(),
        Period = 30,
        RemainingSeconds = 30 - (int)(((DateTimeOffset)now).ToUnixTimeSeconds() % 30)
    });
});

app.Run();

// Request DTOs
record TotpRequest(string Secret, int? Period = 30, int? Digits = 6);
record BatchTotpRequest(string[] Secrets, int? Period = 30, int? Digits = 6);
record ParseRequest(string Uri);
