namespace LibretaSanitariaAPI.DTOs
{
    public record VeterinarioRequest(string Nombre, string Apellido, string Email, int DNI, string Matricula, string Institucion, string Telefono, string? PaginaWeb);

    public record VeterinarioResponse(int ID, string Nombre, string Apellido, string Email, int DNI, string Matricula, string Institucion, string Telefono, string? PaginaWeb);
}
