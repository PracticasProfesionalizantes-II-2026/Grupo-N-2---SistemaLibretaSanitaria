using LibretaSanitariaAPI.Modelos;
using LibretaSanitariaAPI.Repositorios;

namespace LibretaSanitariaAPI.Logica
{
    public interface IMascotaLogica
    {
        IEnumerable<Mascota> GetAll();
        Mascota? GetById(int id);
        IEnumerable<Mascota> GetByDuenioId(int duenioId);
        IEnumerable<Mascota> GetByVetId(int vetId);
        void Add(Mascota mascota);
        void Update(Mascota mascota);
        void Delete(int id);
    }

    public class MascotaLogica : IMascotaLogica
    {
        private readonly IMascotaRepositorio _repositorio;

        public MascotaLogica(IMascotaRepositorio repositorio)
        {
            _repositorio = repositorio;
        }

        public IEnumerable<Mascota> GetAll() => _repositorio.GetAll();
        public Mascota? GetById(int id) => _repositorio.GetById(id);
        public IEnumerable<Mascota> GetByDuenioId(int duenioId) => _repositorio.GetByDuenioId(duenioId);
        public IEnumerable<Mascota> GetByVetId(int vetId) => _repositorio.GetByVetId(vetId);

        public void Add(Mascota mascota)
        {
            mascota.QR = Guid.NewGuid().ToString("N");
            _repositorio.Add(mascota);
        }

        public void Update(Mascota mascota) => _repositorio.Update(mascota);
        public void Delete(int id) => _repositorio.Delete(id);
    }
}
