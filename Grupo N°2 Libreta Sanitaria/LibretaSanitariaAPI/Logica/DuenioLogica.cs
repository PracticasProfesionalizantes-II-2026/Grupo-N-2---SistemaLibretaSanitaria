using LibretaSanitariaAPI.Modelos;
using LibretaSanitariaAPI.Repositorios;

namespace LibretaSanitariaAPI.Logica
{
    public interface IDuenioLogica
    {
        IEnumerable<Duenio> GetAll();
        Duenio? GetById(int id);
        void Add(Duenio duenio);
        void Update(Duenio duenio);
        void Delete(int id);
    }

    public class DuenioLogica : IDuenioLogica
    {
        private readonly IDuenioRepositorio _repositorio;

        public DuenioLogica(IDuenioRepositorio repositorio)
        {
            _repositorio = repositorio;
        }

        public IEnumerable<Duenio> GetAll() => _repositorio.GetAll();
        public Duenio? GetById(int id) => _repositorio.GetById(id);
        public void Add(Duenio duenio) => _repositorio.Add(duenio);
        public void Update(Duenio duenio) => _repositorio.Update(duenio);
        public void Delete(int id) => _repositorio.Delete(id);
    }
}
