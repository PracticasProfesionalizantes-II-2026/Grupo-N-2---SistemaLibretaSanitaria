using Microsoft.EntityFrameworkCore;
using LibretaSanitariaAPI.Datos;
using LibretaSanitariaAPI.Modelos;

namespace LibretaSanitariaAPI.Repositorios
{
    public interface IRecordatorioRepositorio
    {
        IEnumerable<Recordatorio> GetAll();
        Recordatorio? GetById(int id);
        IEnumerable<Recordatorio> GetByMascotaId(int mascotaId);
        void Add(Recordatorio recordatorio);
        void Update(Recordatorio recordatorio);
        void Delete(int id);
    }

    public class RecordatorioRepositorio : IRecordatorioRepositorio
    {
        private readonly LibretaDbContext _context;

        public RecordatorioRepositorio(LibretaDbContext context)
        {
            _context = context;
        }

        public IEnumerable<Recordatorio> GetAll()
        {
            return _context.Recordatorios.Include(r => r.Mascota).ToList();
        }

        public Recordatorio? GetById(int id)
        {
            return _context.Recordatorios.Include(r => r.Mascota).FirstOrDefault(r => r.ID == id);
        }

        public IEnumerable<Recordatorio> GetByMascotaId(int mascotaId)
        {
            return _context.Recordatorios.Include(r => r.Mascota).Where(r => r.MascotaId == mascotaId).ToList();
        }

        public void Add(Recordatorio recordatorio)
        {
            _context.Recordatorios.Add(recordatorio);
            _context.SaveChanges();
        }

        public void Update(Recordatorio recordatorio)
        {
            _context.Recordatorios.Update(recordatorio);
            _context.SaveChanges();
        }

        public void Delete(int id)
        {
            var recordatorio = _context.Recordatorios.Find(id);
            if (recordatorio != null)
            {
                _context.Recordatorios.Remove(recordatorio);
                _context.SaveChanges();
            }
        }
    }
}
