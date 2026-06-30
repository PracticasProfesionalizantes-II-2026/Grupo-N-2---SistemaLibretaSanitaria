namespace LibretaSanitariaAPI.DTOs
{
    public record MascotaRequest(string Nombre, string Especie, string Raza, string? Sexo, DateTime? FechaNacimiento, decimal? Peso, int DuenioId);

    public record MascotaResponse(int ID, string Nombre, string Especie, string Raza, string? Sexo, DateTime? FechaNacimiento, decimal? Peso, string QR, int DuenioId, string DuenioNombre);
}
