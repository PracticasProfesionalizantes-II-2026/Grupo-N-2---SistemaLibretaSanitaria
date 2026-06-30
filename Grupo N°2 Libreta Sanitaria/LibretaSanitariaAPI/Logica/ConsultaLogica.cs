using LibretaSanitariaAPI.Modelos;
using LibretaSanitariaAPI.Repositorios;

namespace LibretaSanitariaAPI.Logica
{
    public interface IConsultaLogica
    {
        IEnumerable<Consulta> GetAll();
        Consulta? GetById(int id);
        IEnumerable<Consulta> GetByMascotaId(int mascotaId);
        IEnumerable<Consulta> GetByVetId(int vetId);
        void Add(Consulta consulta);
        void Update(Consulta consulta);
        void Delete(int id);
    }

    public class ConsultaLogica : IConsultaLogica
    {
        private readonly IConsultaRepositorio _repositorio;

        public ConsultaLogica(IConsultaRepositorio repositorio)
        {
            _repositorio = repositorio;
        }

        public IEnumerable<Consulta> GetAll() => _repositorio.GetAll();
        public Consulta? GetById(int id) => _repositorio.GetById(id);
        public IEnumerable<Consulta> GetByMascotaId(int mascotaId) => _repositorio.GetByMascotaId(mascotaId);
        public IEnumerable<Consulta> GetByVetId(int vetId) => _repositorio.GetByVetId(vetId);
        public void Add(Consulta consulta) => _repositorio.Add(consulta);
        public void Update(Consulta consulta) => _repositorio.Update(consulta);
        public void Delete(int id) => _repositorio.Delete(id);
    }
}
