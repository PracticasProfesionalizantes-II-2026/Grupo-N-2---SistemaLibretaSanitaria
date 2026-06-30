using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.DTOs
{
    public record ConsultaRequest(DateTime FechaTurno, string Motivo, TipoConsulta Tipo, int MascotaId, int VeterinarioId);

    public record ConsultaResponse(int ID, DateTime FechaTurno, string Motivo, TipoConsulta Tipo, int MascotaId, string MascotaNombre, int VeterinarioId, string VeterinarioNombre);
}
