using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;

namespace TwoFactorAuth.Services;

public record TotpResult(
    string Code,
    int RemainingSeconds,
    int Period,
    string Secret,
    string? Account = null,
    string? Issuer = null,
    long Timestamp = 0
);

public record OtpAuthInfo(
    string Secret,
    string Account,
    string Issuer,
    int Digits = 6,
    int Period = 30,
    string Algorithm = "SHA1"
);

public static class TotpService
{
    private const string Base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    /// <summary>
    /// Generates TOTP code and metadata for a given secret key or otpauth:// URI.
    /// </summary>
    public static TotpResult GenerateTotp(string input, int period = 30, int digits = 6, DateTime? time = null)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            throw new ArgumentException("Secret key or otpauth URI cannot be empty.", nameof(input));
        }

        string secret = input.Trim();
        string? account = null;
        string? issuer = null;

        // Check if input is otpauth:// URI
        if (secret.StartsWith("otpauth://", StringComparison.OrdinalIgnoreCase))
        {
            var parsed = ParseOtpAuthUri(secret);
            secret = parsed.Secret;
            account = parsed.Account;
            issuer = parsed.Issuer;
            digits = parsed.Digits;
            period = parsed.Period;
        }
        else if (secret.Contains(' ') || secret.Contains('|') || secret.Contains(':'))
        {
            // Support formats like "Google: JBSWY3DPEHPK3PXP" or "user@domain.com | JBSWY3DPEHPK3PXP"
            var parts = secret.Split(new[] { ' ', '|', ':', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                // Find which part looks like a Base32 secret (contains mostly A-Z, 2-7)
                var possibleSecretIndex = Array.FindIndex(parts, p => CleanBase32(p).Length >= 8);
                if (possibleSecretIndex >= 0)
                {
                    secret = parts[possibleSecretIndex];
                    account = string.Join(" ", parts.Where((_, i) => i != possibleSecretIndex));
                }
            }
        }

        string cleanSecret = CleanBase32(secret);
        if (string.IsNullOrEmpty(cleanSecret))
        {
            throw new ArgumentException("Invalid Base32 secret key.", nameof(input));
        }

        byte[] secretBytes = Base32Decode(cleanSecret);
        DateTime targetTime = time ?? DateTime.UtcNow;
        long unixTimestamp = ((DateTimeOffset)targetTime).ToUnixTimeSeconds();

        long timeStep = unixTimestamp / period;
        int remainingSeconds = period - (int)(unixTimestamp % period);

        byte[] timeBytes = BitConverter.GetBytes(timeStep);
        if (BitConverter.IsLittleEndian)
        {
            Array.Reverse(timeBytes);
        }

        using var hmac = new HMACSHA1(secretBytes);
        byte[] hash = hmac.ComputeHash(timeBytes);

        int offset = hash[hash.Length - 1] & 0x0F;
        int binaryCode = ((hash[offset] & 0x7F) << 24)
                       | ((hash[offset + 1] & 0xFF) << 16)
                       | ((hash[offset + 2] & 0xFF) << 8)
                       | (hash[offset + 3] & 0xFF);

        int mod = (int)Math.Pow(10, digits);
        int codeInt = binaryCode % mod;
        string code = codeInt.ToString($"D{digits}");

        return new TotpResult(
            Code: code,
            RemainingSeconds: remainingSeconds,
            Period: period,
            Secret: cleanSecret,
            Account: account,
            Issuer: issuer,
            Timestamp: unixTimestamp
        );
    }

    /// <summary>
    /// Parses an otpauth://totp/... URI.
    /// </summary>
    public static OtpAuthInfo ParseOtpAuthUri(string uriString)
    {
        var uri = new Uri(uriString);
        if (!uri.Scheme.Equals("otpauth", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("URI must start with otpauth://");
        }

        string path = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
        string account = path;
        string issuer = "";

        if (path.Contains(':'))
        {
            var parts = path.Split(':', 2);
            issuer = parts[0];
            account = parts[1];
        }

        var query = HttpUtility.ParseQueryString(uri.Query);
        string secret = query["secret"] ?? throw new ArgumentException("Missing secret parameter in otpauth URI.");
        
        if (query["issuer"] is string queryIssuer && !string.IsNullOrWhiteSpace(queryIssuer))
        {
            issuer = queryIssuer;
        }

        int digits = int.TryParse(query["digits"], out int d) ? d : 6;
        int period = int.TryParse(query["period"], out int p) ? p : 30;
        string algorithm = query["algorithm"] ?? "SHA1";

        return new OtpAuthInfo(
            Secret: secret,
            Account: account.Trim(),
            Issuer: issuer.Trim(),
            Digits: digits,
            Period: period,
            Algorithm: algorithm
        );
    }

    /// <summary>
    /// Cleans and normalizes Base32 input string.
    /// </summary>
    public static string CleanBase32(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        return Regex.Replace(input.ToUpperInvariant(), @"[^A-Z2-7]", "");
    }

    /// <summary>
    /// Decodes a Base32 string into bytes.
    /// </summary>
    private static byte[] Base32Decode(string base32)
    {
        string cleaned = CleanBase32(base32);
        if (string.IsNullOrEmpty(cleaned)) return Array.Empty<byte>();

        int byteCount = cleaned.Length * 5 / 8;
        byte[] returnArray = new byte[byteCount];
        byte curByte = 0, bitsRemaining = 8;
        int arrayIndex = 0;

        foreach (char c in cleaned)
        {
            int value = Base32Chars.IndexOf(c);
            if (value < 0) continue;

            if (bitsRemaining > 5)
            {
                int mask = value << (bitsRemaining - 5);
                curByte = (byte)(curByte | mask);
                bitsRemaining -= 5;
            }
            else
            {
                int mask = value >> (5 - bitsRemaining);
                curByte = (byte)(curByte | mask);
                returnArray[arrayIndex++] = curByte;

                curByte = (byte)((value << (3 + bitsRemaining)) & 255);
                bitsRemaining = (byte)(8 - (5 - bitsRemaining));
            }
        }

        if (arrayIndex < byteCount)
        {
            returnArray[arrayIndex] = curByte;
        }

        return returnArray;
    }
}
