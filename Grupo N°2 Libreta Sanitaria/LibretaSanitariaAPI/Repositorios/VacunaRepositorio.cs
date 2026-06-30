using Microsoft.EntityFrameworkCore;
using LibretaSanitariaAPI.Datos;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Repositorios
{
    public interface IVacunaRepositorio
    {
        IEnumerable<Vacuna> GetAll();
        Vacuna? GetById(int id);
        IEnumerable<Vacuna> GetByConsultaId(int consultaId);
        void Add(Vacuna vacuna);
        void Update(Vacuna vacuna);
        void Delete(int id);
    }

    public class VacunaRepositorio : IVacunaRepositorio
    {
        private readonly LibretaDbContext _context;

        public VacunaRepositorio(LibretaDbContext context)
        {
            _context = context;
        }

        public IEnumerable<Vacuna> GetAll()
        {
            return _context.Vacunas.ToList();
        }

        public Vacuna? GetById(int id)
        {
            return _context.Vacunas.Find(id);
        }

        public IEnumerable<Vacuna> GetByConsultaId(int consultaId)
        {
            return _context.Vacunas.Where(v => v.ConsultaId == consultaId).ToList();
        }

        public void Add(Vacuna vacuna)
        {
            _context.Vacunas.Add(vacuna);
            _context.SaveChanges();
        }

        public void Update(Vacuna vacuna)
        {
            _context.Vacunas.Update(vacuna);
            _context.SaveChanges();
        }

        public void Delete(int id)
        {
            var vacuna = _context.Vacunas.Find(id);
            if (vacuna != null)
            {
                _context.Vacunas.Remove(vacuna);
                _context.SaveChanges();
            }
        }
    }
}
