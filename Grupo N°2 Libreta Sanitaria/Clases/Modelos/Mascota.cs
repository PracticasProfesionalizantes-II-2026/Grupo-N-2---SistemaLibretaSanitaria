using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Clases.Modelos
{
    public class Mascota
    {
        [Key] public int ID { get; set; }
        public string Nombre { get; set; }
        public string Especie { get; set; }
        public string Raza { get; set; }
        public string? Sexo { get; set; } 
        public DateTime? FechaNacimiento { get; set; }
        public decimal? Peso { get; set; }
        public string QR { get; set; }

        // Relaciones
        public List<Recordatorio> Recordatorios { get; set; } = new List<Recordatorio>();
        public int DuenioId { get; set; }
        public Duenio Duenio { get; set; }
        public List<Consulta> Consultas { get; set; } = new List<Consulta>();

    }
}
