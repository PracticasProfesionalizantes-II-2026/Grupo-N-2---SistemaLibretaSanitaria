namespace LibretaSanitariaAPI.Modelos
{
    public class Consulta
    {
        public int ID { get; set; }
        public DateTime FechaTurno { get; set; }
        public string Motivo { get; set; } = string.Empty;
        public TipoConsulta Tipo { get; set; }

        public int MascotaId { get; set; }
        public Mascota Mascota { get; set; } = null!;

        public int VeterinarioId { get; set; }
        public Veterinario Veterinario { get; set; } = null!;

        public int? HistorialMedicoId { get; set; }
        public HistorialMedico? HistorialMedico { get; set; }

        public List<Vacuna> Vacunas { get; set; } = new List<Vacuna>();
    }

    public enum TipoConsulta
    {
        General,
        Urgencia,
        Especialista
    }
}
