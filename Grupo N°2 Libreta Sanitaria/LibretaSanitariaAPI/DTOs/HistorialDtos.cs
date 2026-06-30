using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.DTOs
{
    public record HistorialRequest(string? Descripcion, Tratamiento TratamientoRealizado, TipoConsulta TipoConsulta, int MascotaId);

    public record HistorialResponse(int ID, string? Descripcion, Tratamiento TratamientoRealizado, TipoConsulta TipoConsulta, int MascotaId, string MascotaNombre);
}
