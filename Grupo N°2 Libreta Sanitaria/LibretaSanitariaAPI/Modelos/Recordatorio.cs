namespace LibretaSanitariaAPI.Modelos
{
    public class Recordatorio
    {
        public int ID { get; set; }
        public string Titulo { get; set; } = string.Empty;
        public string Descripcion { get; set; } = string.Empty;
        public DateTime FechaProgramada { get; set; }
        public EstadoRecordatorio Estado { get; set; }

        public int MascotaId { get; set; }
        public Mascota Mascota { get; set; } = null!;
    }

    public enum EstadoRecordatorio
    {
        Pendiente,
        Completado,
        Cancelado
    }
}
