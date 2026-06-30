namespace LibretaSanitariaAPI.Modelos
{
    public class HistorialMedico
    {
        public int ID { get; set; }
        public string? Descripcion { get; set; }
        public Tratamiento TratamientoRealizado { get; set; }
        public TipoConsulta TipoConsulta { get; set; }

        public int MascotaId { get; set; }
        public Mascota Mascota { get; set; } = null!;

        public List<Consulta> Consultas { get; set; } = new List<Consulta>();
        public List<Veterinario> Veterinarios { get; set; } = new List<Veterinario>();
    }

    public enum Tratamiento
    {
        Ninguno,
        Medicacion,
        Cirugia,
        Terapia
    }
}
