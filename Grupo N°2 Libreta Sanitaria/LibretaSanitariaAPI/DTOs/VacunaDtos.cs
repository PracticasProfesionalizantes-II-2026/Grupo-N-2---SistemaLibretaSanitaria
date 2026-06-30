namespace LibretaSanitariaAPI.DTOs
{
    public record VacunaRequest(string Nombre, int Dosis, string Tipo, int ConsultaId);

    public record VacunaResponse(int ID, string Nombre, int Dosis, string Tipo, int ConsultaId);
}
