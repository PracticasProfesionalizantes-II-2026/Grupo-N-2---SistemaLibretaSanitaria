using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.DTOs
{
    public record RecordatorioRequest(string Titulo, string Descripcion, DateTime FechaProgramada, int MascotaId);

    public record RecordatorioResponse(int ID, string Titulo, string Descripcion, DateTime FechaProgramada, EstadoRecordatorio Estado, int MascotaId, string MascotaNombre);
}
