using LibretaSanitariaAPI.Modelos;
using LibretaSanitariaAPI.Repositorios;

namespace LibretaSanitariaAPI.Logica
{
    public interface IVacunaLogica
    {
        IEnumerable<Vacuna> GetAll();
        Vacuna? GetById(int id);
        IEnumerable<Vacuna> GetByConsultaId(int consultaId);
        void Add(Vacuna vacuna);
        void Update(Vacuna vacuna);
        void Delete(int id);
    }

    public class VacunaLogica : IVacunaLogica
    {
        private readonly IVacunaRepositorio _repositorio;

        public VacunaLogica(IVacunaRepositorio repositorio)
        {
            _repositorio = repositorio;
        }

        public IEnumerable<Vacuna> GetAll() => _repositorio.GetAll();
        public Vacuna? GetById(int id) => _repositorio.GetById(id);
        public IEnumerable<Vacuna> GetByConsultaId(int consultaId) => _repositorio.GetByConsultaId(consultaId);
        public void Add(Vacuna vacuna) => _repositorio.Add(vacuna);
        public void Update(Vacuna vacuna) => _repositorio.Update(vacuna);
        public void Delete(int id) => _repositorio.Delete(id);
    }
}
