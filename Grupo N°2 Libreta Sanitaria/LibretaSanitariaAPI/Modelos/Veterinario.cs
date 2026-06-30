namespace LibretaSanitariaAPI.Modelos
{
    public class Veterinario : Usuario
    {
        public int DNI { get; set; }
        public string Matricula { get; set; } = string.Empty;
        public string Institucion { get; set; } = string.Empty;
        public string Telefono { get; set; } = string.Empty;
        public string? PaginaWeb { get; set; }

        public List<Consulta> Consultas { get; set; } = new List<Consulta>();
        public List<HistorialMedico> HistorialesMedicos { get; set; } = new List<HistorialMedico>();
    }
}
