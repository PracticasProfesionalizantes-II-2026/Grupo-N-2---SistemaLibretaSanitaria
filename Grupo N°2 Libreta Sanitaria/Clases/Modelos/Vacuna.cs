using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Clases.Modelos
{
    public class Vacuna
    {
        [Key] public int ID { get; set; }
        public string Nombre { get; set; }
        public int Dosis { get; set; }
        public string Tipo { get; set; }

        // Relaciones
        public int ConsultaId { get; set; }
        public Consulta Consulta { get; set; }
    }
}
