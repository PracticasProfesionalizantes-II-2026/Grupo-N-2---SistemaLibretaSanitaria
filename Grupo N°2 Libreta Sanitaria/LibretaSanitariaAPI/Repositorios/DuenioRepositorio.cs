using Microsoft.EntityFrameworkCore;
using LibretaSanitariaAPI.Datos;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Repositorios
{
    public interface IDuenioRepositorio
    {
        IEnumerable<Duenio> GetAll();
        Duenio? GetById(int id);
        void Add(Duenio duenio);
        void Update(Duenio duenio);
        void Delete(int id);
    }

    public class DuenioRepositorio : IDuenioRepositorio
    {
        private readonly LibretaDbContext _context;

        public DuenioRepositorio(LibretaDbContext context)
        {
            _context = context;
        }

        public IEnumerable<Duenio> GetAll()
        {
            return _context.Duenios.Include(d => d.Mascotas).ToList();
        }

        public Duenio? GetById(int id)
        {
            return _context.Duenios.Include(d => d.Mascotas).FirstOrDefault(d => d.ID == id);
        }

        public void Add(Duenio duenio)
        {
            _context.Duenios.Add(duenio);
            _context.SaveChanges();
        }

        public void Update(Duenio duenio)
        {
            _context.Duenios.Update(duenio);
            _context.SaveChanges();
        }

        public void Delete(int id)
        {
            var duenio = _context.Duenios.Find(id);
            if (duenio != null)
            {
                _context.Duenios.Remove(duenio);
                _context.SaveChanges();
            }
        }
    }
}
