_HAS_SA = False
try:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
    from .models import Base
    _HAS_SA = True
except ImportError:
    pass

from config import DATABASE_URL


if _HAS_SA:
    engine = create_async_engine(DATABASE_URL, echo=False)
    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async def init_db():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def get_db():
        async with AsyncSessionLocal() as session:
            yield session
else:
    # Stub fallbacks when SQLAlchemy/aiosqlite not installed
    import contextlib

    engine = None
    AsyncSessionLocal = None

    async def init_db():
        print("[DB] SQLAlchemy not installed — DB features disabled. pip install sqlalchemy aiosqlite")

    @contextlib.asynccontextmanager
    async def _null_session():
        yield None

    AsyncSessionLocal = _null_session

    async def get_db():
        yield None
