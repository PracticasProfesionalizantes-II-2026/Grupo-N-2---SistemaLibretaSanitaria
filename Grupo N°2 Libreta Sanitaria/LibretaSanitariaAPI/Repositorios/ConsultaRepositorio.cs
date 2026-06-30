using Microsoft.EntityFrameworkCore;
using LibretaSanitariaAPI.Datos;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Repositorios
{
    public interface IConsultaRepositorio
    {
        IEnumerable<Consulta> GetAll();
        Consulta? GetById(int id);
        IEnumerable<Consulta> GetByMascotaId(int mascotaId);
        IEnumerable<Consulta> GetByVetId(int vetId);
        void Add(Consulta consulta);
        void Update(Consulta consulta);
        void Delete(int id);
    }

    public class ConsultaRepositorio : IConsultaRepositorio
    {
        private readonly LibretaDbContext _context;

        public ConsultaRepositorio(LibretaDbContext context)
        {
            _context = context;
        }

        public IEnumerable<Consulta> GetAll()
        {
            return _context.Consultas
                .Include(c => c.Mascota)
                .Include(c => c.Veterinario)
                .Include(c => c.Vacunas)
                .ToList();
        }

        public Consulta? GetById(int id)
        {
            return _context.Consultas
                .Include(c => c.Mascota)
                .Include(c => c.Veterinario)
                .Include(c => c.Vacunas)
                .FirstOrDefault(c => c.ID == id);
        }

        public IEnumerable<Consulta> GetByMascotaId(int mascotaId)
        {
            return _context.Consultas
                .Include(c => c.Mascota)
                .Include(c => c.Veterinario)
                .Include(c => c.Vacunas)
                .Where(c => c.MascotaId == mascotaId)
                .ToList();
        }

        public IEnumerable<Consulta> GetByVetId(int vetId)
        {
            return _context.Consultas
                .Include(c => c.Mascota)
                .Include(c => c.Veterinario)
                .Include(c => c.Vacunas)
                .Where(c => c.VeterinarioId == vetId)
                .ToList();
        }

        public void Add(Consulta consulta)
        {
            _context.Consultas.Add(consulta);
            _context.SaveChanges();
        }

        public void Update(Consulta consulta)
        {
            _context.Consultas.Update(consulta);
            _context.SaveChanges();
        }

        public void Delete(int id)
        {
            var consulta = _context.Consultas.Find(id);
            if (consulta != null)
            {
                _context.Consultas.Remove(consulta);
                _context.SaveChanges();
            }
        }
    }
}
