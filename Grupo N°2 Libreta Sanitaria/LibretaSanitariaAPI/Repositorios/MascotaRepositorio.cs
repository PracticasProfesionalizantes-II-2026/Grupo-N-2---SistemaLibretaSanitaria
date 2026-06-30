using Microsoft.EntityFrameworkCore;
using LibretaSanitariaAPI.Datos;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Repositorios
{
    public interface IMascotaRepositorio
    {
        IEnumerable<Mascota> GetAll();
        Mascota? GetById(int id);
        IEnumerable<Mascota> GetByDuenioId(int duenioId);
        IEnumerable<Mascota> GetByVetId(int vetId);
        void Add(Mascota mascota);
        void Update(Mascota mascota);
        void Delete(int id);
    }

    public class MascotaRepositorio : IMascotaRepositorio
    {
        private readonly LibretaDbContext _context;

        public MascotaRepositorio(LibretaDbContext context)
        {
            _context = context;
        }

        public IEnumerable<Mascota> GetAll()
        {
            return _context.Mascotas.Include(m => m.Duenio).ToList();
        }

        public Mascota? GetById(int id)
        {
            return _context.Mascotas.Include(m => m.Duenio).FirstOrDefault(m => m.ID == id);
        }

        public IEnumerable<Mascota> GetByDuenioId(int duenioId)
        {
            return _context.Mascotas.Include(m => m.Duenio).Where(m => m.DuenioId == duenioId).ToList();
        }

        public IEnumerable<Mascota> GetByVetId(int vetId)
        {
            return _context.Consultas
                .Where(c => c.VeterinarioId == vetId)
                .Select(c => c.Mascota)
                .Include(m => m.Duenio)
                .Distinct()
                .ToList();
        }

        public void Add(Mascota mascota)
        {
            _context.Mascotas.Add(mascota);
            _context.SaveChanges();
        }

        public void Update(Mascota mascota)
        {
            _context.Mascotas.Update(mascota);
            _context.SaveChanges();
        }

        public void Delete(int id)
        {
            var mascota = _context.Mascotas.Find(id);
            if (mascota != null)
            {
                _context.Mascotas.Remove(mascota);
                _context.SaveChanges();
            }
        }
    }
}
