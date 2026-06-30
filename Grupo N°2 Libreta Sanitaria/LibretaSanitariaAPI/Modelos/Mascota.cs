using System.ComponentModel.DataAnnotations.Schema;

namespace LibretaSanitariaAPI.Modelos
{
    public class Mascota
    {
        public int ID { get; set; }
        public string Nombre { get; set; } = string.Empty;
        public string Especie { get; set; } = string.Empty;
        public string Raza { get; set; } = string.Empty;
        public string? Sexo { get; set; }
        public DateTime? FechaNacimiento { get; set; }

        [Column(TypeName = "decimal(5,2)")]
        public decimal? Peso { get; set; }

        public string QR { get; set; } = string.Empty;

        public int DuenioId { get; set; }
        public Duenio Duenio { get; set; } = null!;

        public List<Consulta> Consultas { get; set; } = new List<Consulta>();
        public List<Recordatorio> Recordatorios { get; set; } = new List<Recordatorio>();
    }
}
