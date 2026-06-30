namespace LibretaSanitariaAPI.Modelos
{
    public class Vacuna
    {
        public int ID { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public int Dosis { get; set; }
        public string Tipo { get; set; } = string.Empty;

        public int ConsultaId { get; set; }
        public Consulta Consulta { get; set; } = null!;
    }
}
