using Microsoft.EntityFrameworkCore;
using LibretaSanitariaAPI.Datos;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Repositorios
{
    public interface IVeterinarioRepositorio
    {
        IEnumerable<Veterinario> GetAll();
        Veterinario? GetById(int id);
        void Add(Veterinario veterinario);
        void Update(Veterinario veterinario);
        void Delete(int id);
    }

    public class VeterinarioRepositorio : IVeterinarioRepositorio
    {
        private readonly LibretaDbContext _context;

        public VeterinarioRepositorio(LibretaDbContext context)
        {
            _context = context;
        }

        public IEnumerable<Veterinario> GetAll()
        {
            return _context.Veterinarios.ToList();
        }

        public Veterinario? GetById(int id)
        {
            return _context.Veterinarios.Find(id);
        }

        public void Add(Veterinario veterinario)
        {
            _context.Veterinarios.Add(veterinario);
            _context.SaveChanges();
        }

        public void Update(Veterinario veterinario)
        {
            _context.Veterinarios.Update(veterinario);
            _context.SaveChanges();
        }

        public void Delete(int id)
        {
            var veterinario = _context.Veterinarios.Find(id);
            if (veterinario != null)
            {
                _context.Veterinarios.Remove(veterinario);
                _context.SaveChanges();
            }
        }
    }
}
