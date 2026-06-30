using LibretaSanitariaAPI.Modelos;
using LibretaSanitariaAPI.Repositorios;

namespace LibretaSanitariaAPI.Logica
{
    public interface IRecordatorioLogica
    {
        IEnumerable<Recordatorio> GetAll();
        Recordatorio? GetById(int id);
        IEnumerable<Recordatorio> GetByMascotaId(int mascotaId);
        void Add(Recordatorio recordatorio);
        void Update(Recordatorio recordatorio);
        void Delete(int id);
    }

    public class RecordatorioLogica : IRecordatorioLogica
    {
        private readonly IRecordatorioRepositorio _repositorio;

        public RecordatorioLogica(IRecordatorioRepositorio repositorio)
        {
            _repositorio = repositorio;
        }

        public IEnumerable<Recordatorio> GetAll() => _repositorio.GetAll();
        public Recordatorio? GetById(int id) => _repositorio.GetById(id);
        public IEnumerable<Recordatorio> GetByMascotaId(int mascotaId) => _repositorio.GetByMascotaId(mascotaId);
        public void Add(Recordatorio recordatorio) => _repositorio.Add(recordatorio);
        public void Update(Recordatorio recordatorio) => _repositorio.Update(recordatorio);
        public void Delete(int id) => _repositorio.Delete(id);
    }
}
