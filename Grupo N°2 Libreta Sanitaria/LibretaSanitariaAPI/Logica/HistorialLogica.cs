using LibretaSanitariaAPI.Modelos;
using LibretaSanitariaAPI.Repositorios;

namespace LibretaSanitariaAPI.Logica
{
    public interface IHistorialLogica
    {
        IEnumerable<HistorialMedico> GetAll();
        HistorialMedico? GetById(int id);
        IEnumerable<HistorialMedico> GetByMascotaId(int mascotaId);
        void Add(HistorialMedico historial);
        void Update(HistorialMedico historial);
        void Delete(int id);
    }

    public class HistorialLogica : IHistorialLogica
    {
        private readonly IHistorialRepositorio _repositorio;

        public HistorialLogica(IHistorialRepositorio repositorio)
        {
            _repositorio = repositorio;
        }

        public IEnumerable<HistorialMedico> GetAll() => _repositorio.GetAll();
        public HistorialMedico? GetById(int id) => _repositorio.GetById(id);
        public IEnumerable<HistorialMedico> GetByMascotaId(int mascotaId) => _repositorio.GetByMascotaId(mascotaId);
        public void Add(HistorialMedico historial) => _repositorio.Add(historial);
        public void Update(HistorialMedico historial) => _repositorio.Update(historial);
        public void Delete(int id) => _repositorio.Delete(id);
    }
}
