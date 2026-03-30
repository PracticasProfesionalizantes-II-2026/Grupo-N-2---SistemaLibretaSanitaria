using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Clases.Modelos
{
    public class Veterinario : Usuario
    {
        public int ID {  get; set; }
        public int DNI { get; set; }
        public string Matricula { get; set; }
        public string Email { get; set; }
        public string Institucion { get; set; }
        public string Telefono { get; set; }
        public string? PaginaWeb { get; set; }

        // Relaciones
        public List<Consulta> Consultas { get; set; } = new List<Consulta>();

    }
}
