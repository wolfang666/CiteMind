from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, Date, ForeignKey
from sqlalchemy.orm import DeclarativeBase, relationship
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    sections = relationship("Section", back_populates="project", cascade="all, delete-orphan")
    todos = relationship("Todo", back_populates="project", cascade="all, delete-orphan")


class Section(Base):
    __tablename__ = "sections"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    section_name = Column(String, nullable=False)
    content = Column(Text, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    project = relationship("Project", back_populates="sections")


class Paper(Base):
    __tablename__ = "papers"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    authors = Column(String, default="")
    year = Column(Integer, nullable=True)
    doi = Column(String, nullable=True)
    abstract = Column(Text, default="")
    cite_key = Column(String, unique=True, nullable=False)
    bibtex = Column(Text, default="")
    source = Column(String, default="local")  # crossref|semantic_scholar|openalex|arxiv|local
    url = Column(String, default="")
    citation_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    citations = relationship("Citation", back_populates="paper", cascade="all, delete-orphan")


class Citation(Base):
    __tablename__ = "citations"
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    paper_id = Column(Integer, ForeignKey("papers.id"), nullable=True)
    cite_key = Column(String, nullable=False)
    verified = Column(Boolean, default=False)
    confidence = Column(Float, default=0.0)
    paper = relationship("Paper", back_populates="citations")


class Todo(Base):
    __tablename__ = "todos"
    id = Column(Integer, primary_key=True)
    title = Column(String, nullable=False)
    done = Column(Boolean, default=False)
    priority = Column(String, default="medium")   # low|medium|high
    due_date = Column(Date, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    project = relationship("Project", back_populates="todos")
