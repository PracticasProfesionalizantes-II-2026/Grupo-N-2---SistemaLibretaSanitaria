using LibretaSanitariaAPI.Modelos;
using LibretaSanitariaAPI.Repositorios;

namespace LibretaSanitariaAPI.Logica
{
    public interface IVeterinarioLogica
    {
        IEnumerable<Veterinario> GetAll();
        Veterinario? GetById(int id);
        void Add(Veterinario veterinario);
        void Update(Veterinario veterinario);
        void Delete(int id);
    }

    public class VeterinarioLogica : IVeterinarioLogica
    {
        private readonly IVeterinarioRepositorio _repositorio;

        public VeterinarioLogica(IVeterinarioRepositorio repositorio)
        {
            _repositorio = repositorio;
        }

        public IEnumerable<Veterinario> GetAll() => _repositorio.GetAll();
        public Veterinario? GetById(int id) => _repositorio.GetById(id);
        public void Add(Veterinario veterinario) => _repositorio.Add(veterinario);
        public void Update(Veterinario veterinario) => _repositorio.Update(veterinario);
        public void Delete(int id) => _repositorio.Delete(id);
    }
}
