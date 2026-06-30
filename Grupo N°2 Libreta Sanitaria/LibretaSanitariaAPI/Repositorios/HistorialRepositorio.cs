using Microsoft.EntityFrameworkCore;
using LibretaSanitariaAPI.Datos;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Repositorios
{
    public interface IHistorialRepositorio
    {
        IEnumerable<HistorialMedico> GetAll();
        HistorialMedico? GetById(int id);
        IEnumerable<HistorialMedico> GetByMascotaId(int mascotaId);
        void Add(HistorialMedico historial);
        void Update(HistorialMedico historial);
        void Delete(int id);
    }

    public class HistorialRepositorio : IHistorialRepositorio
    {
        private readonly LibretaDbContext _context;

        public HistorialRepositorio(LibretaDbContext context)
        {
            _context = context;
        }

        public IEnumerable<HistorialMedico> GetAll()
        {
            return _context.HistorialesMedicos
                .Include(h => h.Mascota)
                .Include(h => h.Veterinarios)
                .Include(h => h.Consultas)
                .ToList();
        }

        public HistorialMedico? GetById(int id)
        {
            return _context.HistorialesMedicos
                .Include(h => h.Mascota)
                .Include(h => h.Veterinarios)
                .Include(h => h.Consultas)
                .FirstOrDefault(h => h.ID == id);
        }

        public IEnumerable<HistorialMedico> GetByMascotaId(int mascotaId)
        {
            return _context.HistorialesMedicos
                .Include(h => h.Mascota)
                .Include(h => h.Veterinarios)
                .Include(h => h.Consultas)
                .Where(h => h.MascotaId == mascotaId)
                .ToList();
        }

        public void Add(HistorialMedico historial)
        {
            _context.HistorialesMedicos.Add(historial);
            _context.SaveChanges();
        }

        public void Update(HistorialMedico historial)
        {
            _context.HistorialesMedicos.Update(historial);
            _context.SaveChanges();
        }

        public void Delete(int id)
        {
            var historial = _context.HistorialesMedicos.Find(id);
            if (historial != null)
            {
                _context.HistorialesMedicos.Remove(historial);
                _context.SaveChanges();
            }
        }
    }
}
