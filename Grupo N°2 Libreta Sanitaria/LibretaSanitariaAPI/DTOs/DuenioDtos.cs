namespace LibretaSanitariaAPI.DTOs
{
    public record DuenioRequest(string Nombre, string Apellido, string Email);

    public record DuenioResponse(int ID, string Nombre, string Apellido, string Email);
}
